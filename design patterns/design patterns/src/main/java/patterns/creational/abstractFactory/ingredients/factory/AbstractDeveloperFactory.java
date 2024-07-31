package patterns.creational.abstractFactory.ingredients.factory;

import patterns.constant.DevType;
import patterns.creational.abstractFactory.ingredients.entity.Developer;

public abstract class AbstractDeveloperFactory {
    public abstract Developer getDeveloper(DevType devType);
}
