package patterns.creational.abstractFactory.ingredients.factory;

import patterns.constant.DevType;
import patterns.creational.abstractFactory.ingredients.entity.Developer;
import patterns.creational.abstractFactory.ingredients.entity.JavaDeveloper;
import patterns.creational.abstractFactory.ingredients.entity.PythonDeveloper;

public class BackendDeveloperFactory extends AbstractDeveloperFactory{
    @Override
    public Developer getDeveloper(DevType devType) {
        final String MESSAGE = "Backend Developer must choose between static and dynamic programming language";
        return switch (devType) {
            case STATIC -> new JavaDeveloper();
            case DYNAMIC -> new PythonDeveloper();
            default -> throw new RuntimeException(MESSAGE);
        };
    }
}
